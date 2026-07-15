/**
 * 上下文窗口管理器 v2
 *
 * 改进（对齐 CC）：
 * - 3 层压缩：MicroCompact（每轮轻量）+ AutoCompact（超阈值摘要）+ ReactiveCompact（413 恢复）
 * - 真实 API Token 计数驱动
 * - 压缩后上下文恢复（文件/规则/任务）
 * - 断路器：连续失败 3 次降级为 truncate
 * - 工具原子性：不拆 tool-call 和 tool-result 对
 */
import type { ChatMessage } from './api'
import { getAIModels, getCompressThreshold, getCtxWindow } from './config'
import { estimateTokens } from './observability'

const PER_MESSAGE_OVERHEAD = 4
const MIN_RECENT = 4
const MAX_RECENT = 20
const MAX_CONSECUTIVE_FAILS = 3
const MAX_TOOL_RESULT_CHARS = 30_000  // 单条 tool result 最大字符数

// 对齐 CC compact/prompt.ts — 9 段结构化摘要，保留代码、错误、关键事实
const SUMMARY_SYSTEM_PROMPT = `Your task is to create a detailed summary of the conversation so far, paying close attention to the user's explicit requests and your previous actions.
This summary should be thorough in capturing technical details, code patterns, and architectural decisions that would be essential for continuing development work without losing context.

Before providing your final summary, wrap your analysis in <analysis> tags to organize your thoughts. In your analysis:
1. Chronologically analyze each message and section of the conversation. For each section identify:
   - The user's explicit requests and intents
   - Your approach to addressing the user's requests
   - Key decisions, technical concepts and code patterns
   - Specific details like: file names, full code snippets, function signatures, file edits
   - Errors that you ran into and how you fixed them
   - Pay special attention to specific user feedback that you received, especially if the user told you to do something differently.
2. Double-check for technical accuracy and completeness.

Your summary should include the following sections:

1. Primary Request and Intent: Capture all of the user's explicit requests and intents in detail
2. Key Technical Concepts: List all important technical concepts, technologies, and frameworks discussed.
3. Files and Code Sections: Enumerate specific files and code sections examined, modified, or created. Include full code snippets where applicable and include a summary of why this file read or edit is important.
4. Errors and fixes: List all errors that you ran into, and how you fixed them. Pay special attention to specific user feedback that you received.
5. Problem Solving: Document problems solved and any ongoing troubleshooting efforts.
6. All user messages: List ALL user messages that are not tool results. These are critical for understanding the users' feedback and changing intent.
7. Pending Tasks: Outline any pending tasks that you have explicitly been asked to work on.
8. Current Work: Describe in detail precisely what was being worked on immediately before this summary request, paying special attention to the most recent messages from both user and assistant. Include file names and code snippets where applicable.
9. Optional Next Step: List the next step that you will take that is related to the most recent work you were doing. Include direct quotes from the most recent conversation showing exactly what task you were working on and where you left off.

<example>
<analysis>
[Your thought process, ensuring all points are covered thoroughly and accurately]
</analysis>

<summary>
1. Primary Request and Intent:
   [Detailed description]

2. Key Technical Concepts:
   - [Concept 1]
   - [Concept 2]

3. Files and Code Sections:
   - [File Name 1]
      - [Summary of why this file is important]
      - [Summary of the changes made to this file, if any]
      - [Important Code Snippet]

4. Errors and fixes:
    - [Detailed description of error 1]:
      - [How you fixed the error]
      - [User feedback on the error if any]

5. Problem Solving:
   [Description of solved problems and ongoing troubleshooting]

6. All user messages:
    - [Detailed non tool use user message]

7. Pending Tasks:
   - [Task 1]

8. Current Work:
   [Precise description of current work]

9. Optional Next Step:
   [Optional Next step to take]

</summary>
</example>

If input contains a previous summary, merge old and new into a single summary.`

export interface CompressResult {
  messages: ChatMessage[]
  wasCompressed: boolean
  originalTokens: number
  compressedTokens: number
  limit: number
  summary?: string
  /** 本轮释放的 token 数 */
  freedTokens?: number
}

export interface PostCompactContext {
  /** 最近读取的文件路径列表 */
  recentFiles: string[]
  /** 项目规则摘要 */
  rulesSummary?: string
}

export class ContextWindowManager {
  private compactionFailCount = 0
  private lastRealInputTokens: number | null = null

  /** 从 streamText 结果中更新真实 API Token 计数 */
  updateRealTokens(inputTokens: number, outputTokens?: number) {
    this.lastRealInputTokens = inputTokens
  }

  /** 重置断路器（成功压缩后调用） */
  private resetBreaker() {
    this.compactionFailCount = 0
  }

  /** 检查断路器是否熔断 */
  private isBreakerTripped(): boolean {
    return this.compactionFailCount >= MAX_CONSECUTIVE_FAILS
  }

  // ====== 第 0 层：Micro Compact（每轮运行，轻量） ======

  /**
   * 微压缩：合并在发送给 API 前对消息做轻量优化
   * - 合并连续同角色消息
   * - 截断超大 tool result（>MAX_TOOL_RESULT_CHARS）
   * - 移除空的 tool result
   */
  microCompact(messages: ChatMessage[]): ChatMessage[] {
    if (messages.length < 3) return messages

    const result: ChatMessage[] = []
    let i = 0

    while (i < messages.length) {
      const current = messages[i]

      // 合并连续的同角色 user 消息
      if (current.role === 'user' && result.length > 0 && result[result.length - 1].role === 'user') {
        const prev = result[result.length - 1]
        const prevContent = typeof prev.content === 'string' ? prev.content : JSON.stringify(prev.content)
        const currContent = typeof current.content === 'string' ? current.content : JSON.stringify(current.content)
        if (prevContent && currContent) {
          result[result.length - 1] = { role: prev.role, content: prevContent + '\n\n' + currContent } as ChatMessage
        }
        i++
        continue
      }

      // 截断超大 tool result
      if (current.role === 'tool') {
        const content = typeof current.content === 'string' ? current.content : ''
        if (content.length > MAX_TOOL_RESULT_CHARS) {
          result.push({
            role: current.role,
            content: content.slice(0, MAX_TOOL_RESULT_CHARS) +
              `\n\n[... 工具结果过长，已截断。完整共 ${content.length} 字符，截断后保留前 ${MAX_TOOL_RESULT_CHARS} 字符 ...]`,
            toolCallId: (current as any).toolCallId,
          } as unknown as ChatMessage)
          i++
          continue
        }
        // 跳过空的 tool result
        if (!content.trim()) {
          i++
          continue
        }
      }

      result.push(current)
      i++
    }

    return result
  }

  // ====== 第 1 层：Auto Compact（超阈值时运行） ======

  /** 自适应计算保留条数：工具调用越多保留越多 */
  static recentCount(messages: ChatMessage[]): number {
    let toolMsgs = 0
    for (const m of messages) {
      if (m.role === 'tool' || (m as any).toolCall) toolMsgs++
    }
    const ratio = 0.2 + toolMsgs * 0.02
    return Math.max(MIN_RECENT, Math.min(MAX_RECENT, Math.floor(messages.length * ratio)))
  }

  estimateMessagesTokens(messages: ChatMessage[]): number {
    let total = 0
    for (const m of messages) {
      const c = m.content as string | Array<{ type: string; text?: string }>
      const content = typeof c === 'string' ? c
        : Array.isArray(c) ? c.map((p: any) => typeof p === 'string' ? p : typeof p === 'object' && 'text' in p ? p.text : JSON.stringify(p)).join(' ') : ''
      total += estimateTokens(content) + PER_MESSAGE_OVERHEAD
    }
    return total
  }

  getContextWindowForModel(): number {
    try {
      const models = getAIModels()
      const enabled = models.find(m => m.enabled && m.apiKey)
      if (enabled) {
        const model = enabled.availableModels?.find(m => m.id === enabled.selectedModel)
        if (model?.contextWindow) return model.contextWindow
      }
    } catch {}
    return getCtxWindow()
  }

  /**
   * 主入口：检查 token 预算，超限则压缩
   * 3 层策略：
   * 1. Micro Compact（每轮）— 由 chatService 在 compress() 前调用
   * 2. Auto Compact（超阈值摘要压缩）
   * 3. 断路器熔断 → truncateOnly
   */
  async compress(
    messages: ChatMessage[],
    contextWindow: number,
    opts?: { force?: boolean; extraTokens?: number; previousSummary?: string },
  ): Promise<CompressResult> {
    // 先做微压缩
    const compacted = this.microCompact(messages)
    const microFreed = messages.length - compacted.length

    const messageTokens = this.estimateMessagesTokens(compacted)
    const originalTokens = messageTokens + (opts?.extraTokens || 0)
    const limit = contextWindow || getCtxWindow()

    // 基础阈值
    let threshold = getCompressThreshold() / 100
    // 工具密集时提前压缩：近20%消息中工具调用比例 >30% → 阈值降10%
    const recentSlice = compacted.slice(Math.floor(compacted.length * 0.8))
    const toolDensity = recentSlice.filter(m => m.role === 'tool').length / Math.max(recentSlice.length, 1)
    if (toolDensity > 0.3) threshold = Math.max(0.5, threshold - 0.1)
    // 小模型保护：至少超过 2000 token 才触发压缩
    if (!opts?.force && (originalTokens <= limit * threshold || originalTokens < 2000)) {
      return { messages: compacted, wasCompressed: microFreed > 0, originalTokens, compressedTokens: originalTokens, limit, freedTokens: microFreed }
    }

    const recentCount = ContextWindowManager.recentCount(compacted)
    if (compacted.length <= recentCount) {
      return { messages: compacted, wasCompressed: microFreed > 0, originalTokens, compressedTokens: originalTokens, limit, freedTokens: microFreed }
    }

    // 断路器检查
    if (this.isBreakerTripped()) {
      const truncResult = this.truncateOnly(compacted, limit, originalTokens)
      return { ...truncResult, freedTokens: microFreed + (originalTokens - truncResult.compressedTokens) }
    }

    // 工具原子性：确保分割点不拆 assistant(tool_calls) 和它的 tool 结果
    let splitIdx = compacted.length - recentCount
    while (splitIdx > 1 && compacted[splitIdx]?.role === 'tool') {
      splitIdx++ // tool 消息不能作为后半段的开始，往后移
    }
    // 反向：split 前的 assistant 如果有 tool_calls，它的 tool 都在后半段，
    // 整个 assistant→tools 链必须一起划到后半段
    while (splitIdx > 1) {
      const prev = compacted[splitIdx - 1]
      if (prev?.role === 'assistant' && Array.isArray((prev as any).toolCalls) && (prev as any).toolCalls.length > 0) {
        splitIdx--
      } else {
        break
      }
    }

    const toSummarize = compacted.slice(0, splitIdx)
    const recent = compacted.slice(splitIdx)

    if (toSummarize.length < 3) {
      return this.truncateOnly(compacted, limit, originalTokens)
    }

    // 摘要堆叠：旧摘要纳入上下文
    let summary: string
    try {
      const context = opts?.previousSummary
        ? `[上一层摘要]\n${opts.previousSummary}\n\n`
        : ''
      const text = context + this.buildConversationText(toSummarize)
      const { delegateToModel } = await import('./chatService')
      const { result } = await delegateToModel('fast', text, SUMMARY_SYSTEM_PROMPT)
      summary = result || ''
    } catch {
      this.compactionFailCount++
      const truncResult = this.truncateOnly(compacted, limit, originalTokens)
      return { ...truncResult, freedTokens: microFreed + (originalTokens - truncResult.compressedTokens) }
    }

    // 成功：重置断路器
    this.resetBreaker()

    const compressedTokens = this.estimateMessagesTokens(recent)
    const freedTokens = originalTokens - compressedTokens

    return {
      messages: recent,
      wasCompressed: true,
      originalTokens,
      compressedTokens,
      limit,
      summary,
      freedTokens,
    }
  }

  // ====== 第 2 层：Reactive Compact（API 返回 context length 错误时） ======

  /**
   * 响应式压缩：比 auto compact 更激进（保留更少消息）
   * 在 API 返回 prompt_too_long / context_length_exceeded 时调用
   */
  async reactiveCompact(
    messages: ChatMessage[],
    contextWindow: number,
    previousSummary?: string,
  ): Promise<CompressResult> {
    // 保留最近 50%（之前 30% 太激进，沙箱/短对话场景易丢失上下文）
    const keepCount = Math.max(MIN_RECENT, Math.floor(messages.length * 0.5))
    let splitIdx = messages.length - keepCount

    // 工具原子性保护
    while (splitIdx > 1 && messages[splitIdx]?.role === 'tool') {
      splitIdx++
    }

    const toSummarize = messages.slice(0, splitIdx)
    const recent = messages.slice(splitIdx)

    const limit = contextWindow || getCtxWindow()
    const originalTokens = this.estimateMessagesTokens(messages)

    if (toSummarize.length < 3) {
      return this.truncateOnly(messages, limit, originalTokens)
    }

    try {
      const context = previousSummary
        ? `[上一层摘要]\n${previousSummary}\n\n`
        : ''
      const text = context + this.buildConversationText(toSummarize)
      const { delegateToModel } = await import('./chatService')
      const { result } = await delegateToModel('fast', text, SUMMARY_SYSTEM_PROMPT)
      const summary = result || ''
      const compressedTokens = this.estimateMessagesTokens(recent)

      this.resetBreaker()

      return {
        messages: recent,
        wasCompressed: true,
        originalTokens,
        compressedTokens,
        limit,
        summary,
        freedTokens: originalTokens - compressedTokens,
      }
    } catch {
      this.compactionFailCount++
      return this.truncateOnly(messages, limit, originalTokens)
    }
  }

  // ====== 辅助方法 ======

  private async summarize(messages: ChatMessage[]): Promise<string> {
    const text = this.buildConversationText(messages)
    const { delegateToModel } = await import('./chatService')
    const { result } = await delegateToModel('fast', text, SUMMARY_SYSTEM_PROMPT)
    if (result) return result
    throw new Error('摘要生成失败')
  }

  private buildConversationText(messages: ChatMessage[]): string {
    return messages
      .map(m => {
        const role = m.role === 'user' ? '用户' : m.role === 'assistant' ? 'AI' : m.role === 'tool' ? '工具' : m.role
        const c = m.content as string | Array<{ type: string; text?: string }>
        const content = typeof c === 'string' ? c
          : Array.isArray(c) ? c.map((p: any) => typeof p === 'string' ? p : typeof p === 'object' && 'text' in p ? p.text : JSON.stringify(p)).join(' ') : ''
        const truncated = content.length > 800 ? content.slice(0, 800) + '...' : content
        return `[${role}]: ${truncated}`
      })
      .join('\n\n')
  }

  private truncateOnly(messages: ChatMessage[], limit: number, originalTokens: number): CompressResult {
    const targetTokens = Math.floor(limit * 0.8)
    const head = messages[0]
    const recentCount = ContextWindowManager.recentCount(messages)
    const recent = messages.slice(-recentCount)
    const middle = messages.slice(1, -recentCount)
    let result = [head, ...middle, ...recent]

    while (this.estimateMessagesTokens(result) > targetTokens && middle.length > 1) {
      middle.shift()
      result = [head, ...middle, ...recent]
    }

    const compressedTokens = this.estimateMessagesTokens(result)
    return { messages: result, wasCompressed: true, originalTokens, compressedTokens, limit, summary: '[Token 超限，已自动截断历史对话]' }
  }
}

/**
 * 压缩后上下文恢复：重新注入关键信息
 * 在 compress() 返回后调用，保证模型仍能访问重要上下文
 *
 * 对齐 CC compact.ts: createPostCompactFileAttachments +
 * getCompactUserSummaryMessage + re-announce tools/agents
 */
export async function buildPostCompactInjection(
  recentFiles: string[],
  rulesSummary?: string,
): Promise<string | null> {
  // 对齐 CC: POST_COMPACT_MAX_FILES_TO_RESTORE = 5
  // POST_COMPACT_TOKEN_BUDGET = 50_000
  const MAX_FILES = 5
  const MAX_CHARS_PER_FILE = 20_000  // ~5000 tokens @ 4 chars/token
  const MAX_TOTAL_CHARS = 200_000    // ~50000 tokens

  const parts: string[] = []

  // 工具纪律提醒
  parts.push(`<system-reminder>
🛑 上下文已压缩。摘要覆盖了早期对话，下方是你最近操作文件的最新内容。
- 摘要中的技术细节、错误修复、关键决策仍然有效
- 下方文件内容是对应文件的最新状态，无需重新读取
- 如果摘要和下方文件内容有冲突，以文件内容为准
</system-reminder>`)

  if (rulesSummary) {
    parts.push(`<system-reminder>\n[项目规则摘要]\n${rulesSummary}\n</system-reminder>`)
  }

  // 对齐 CC createPostCompactFileAttachments: 重读文件内容并注入
  if (recentFiles.length > 0) {
    const fsApi = (window as any).electronAPI?.fs
    const fileParts: string[] = []
    let totalChars = 0

    for (const filePath of recentFiles.slice(0, MAX_FILES)) {
      if (totalChars >= MAX_TOTAL_CHARS) break

      try {
        const result = fsApi
          ? await fsApi.readFile(filePath)
          : null
        if (result?.success && result.content) {
          let content = result.content
          // 截断超大文件
          if (content.length > MAX_CHARS_PER_FILE) {
            content = content.slice(0, MAX_CHARS_PER_FILE) +
              `\n[... ${result.content.length - MAX_CHARS_PER_FILE} more chars]`
          }
          if (totalChars + content.length > MAX_TOTAL_CHARS) {
            content = content.slice(0, MAX_TOTAL_CHARS - totalChars) + '\n[... truncated]'
          }
          totalChars += content.length
          const lines = result.content.split('\n').length
          fileParts.push(`### ${filePath} (${lines} lines, ${result.content.length} chars)\n\`\`\`\n${content}\n\`\`\``)
        } else {
          fileParts.push(`### ${filePath}\n(无法读取: ${result?.error || '未知错误'})`)
        }
      } catch {
        fileParts.push(`### ${filePath}\n(读取失败)`)
      }
    }

    if (fileParts.length > 0) {
      parts.push(`<system-reminder>
[压缩后文件恢复 — 以下文件来自压缩前最近的操作，已重新读取为最新状态]

${fileParts.join('\n\n')}
</system-reminder>`)
    }
  }

  return parts.length > 0 ? parts.join('\n\n') : null
}

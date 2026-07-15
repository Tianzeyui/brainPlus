import { useState, useEffect, useRef, memo } from 'react'
import { Check, X, Shield, ShieldCheck, Cable, BookOpen, MessageSquare, FileText, Image, Zap, FolderOpen, Loader2, ChevronDown, IdCard, ExternalLink, Brain, Terminal, Search, Globe, Trash2, Bookmark, Layers } from 'lucide-react'
import MarkdownPreview from '@uiw/react-markdown-preview'
import type { UIMessage, ToolCallStatus, MessageAttachment, AgentToolCallEntry, AgentTimelineItem, TerminalStatus } from '@/types/chat'
import { useAuth } from '@/contexts/AuthContext'
import type { FileOpRequest } from '@/lib/fileOpManager'

/** 工具结果格式化：JSON 结果包进代码块，纯文本保持原样 */
function formatToolResult(result: string, type: string): string {
  const text = stripHtml(String(result))
  // 沙箱代码已经格式化好了，直接返回
  if (type === 'sandbox') return text
  // 尝试解析为 JSON，成功则包进代码块，失败则原样返回
  try {
    JSON.parse(text)
    return '```json\n' + text + '\n```'
  } catch {
    return text
  }
}

/** 剥离 HTML 标签，避免 MarkdownPreview 将 <tag> 当作 React 组件渲染 */
function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '')
}

interface ChatMessageProps {
  msg: UIMessage
}

/** 工具类型 → 图标和标签 */
const TOOL_STYLE: Record<string, {
  icon: typeof Check
  labelIcon: typeof Shield
  label: string
}> = {
  sandbox: { icon: ShieldCheck, labelIcon: Shield, label: '沙箱' },
  skill: { icon: Check, labelIcon: BookOpen, label: 'Skill' },
  mcp: { icon: Check, labelIcon: Cable, label: 'MCP' },
  agent: { icon: Check, labelIcon: MessageSquare, label: 'Agent' },
  gateway: { icon: Check, labelIcon: Zap, label: '网关' },
  workspace: { icon: Check, labelIcon: FolderOpen, label: '工作区' },
}

/** 不需要在聊天流中展示的工具——已有专用 UI 承载 */
const HIDDEN_TOOLS = new Set([
  'run_terminal',
  'run_terminal_input',
  'ask_user',
  'update_task_list',
  'show_progress',
  'notify_complete',
])

function ChatMessageInner({ msg }: ChatMessageProps) {
  if (msg.terminal) {
    return (
      <TerminalBubble
        ts={msg.terminal}
        onConfirm={async (id, persist) => {
          const { confirm } = await import('@/lib/terminalManager')
          confirm(id, persist)
        }}
        onReject={async (id) => {
          const { reject } = await import('@/lib/terminalManager')
          reject(id)
        }}
        onCancel={async (id) => {
          const { killTerminal } = await import('@/lib/terminalManager')
          await killTerminal(id)
        }}
      />
    )
  }

  if (msg.fileOp) {
    return (
      <FileOpBubble fo={msg.fileOp} />
    )
  }

  if (msg.role === 'tool' && (msg as any).toolBatch) {
    const batch = (msg as any).toolBatch as ToolCallStatus[]
    return (
      <div className="flex flex-col gap-2">
        {batch.map(tc => {
          if (HIDDEN_TOOLS.has(tc.name)) return null
          if (tc.name === 'web_search') return <SearchBubble key={tc.id} tc={tc} />
          if (tc.name === 'web_fetch') return <FetchBubble key={tc.id} tc={tc} />
          if (tc.name === 'delegate_task' || tc.name === 'delegate_batch') return <DelegateBubble key={tc.id} tc={tc} />
          if (tc.name.startsWith('memory_')) return <MemoryBubble key={tc.id} tc={tc} />
          return <ToolBubble key={tc.id} tc={tc} />
        })}
      </div>
    )
  }

  if (msg.role === 'tool' && msg.toolCall) {
    if (HIDDEN_TOOLS.has(msg.toolCall.name)) return null
    // 搜索/抓取用自定义样式
    if (msg.toolCall.name === 'web_search') return <SearchBubble tc={msg.toolCall} />
    if (msg.toolCall.name === 'web_fetch') return <FetchBubble tc={msg.toolCall} />
    if (msg.toolCall.name === 'delegate_task') return <DelegateBubble tc={msg.toolCall} />
    if (msg.toolCall.name.startsWith('memory_')) return <MemoryBubble tc={msg.toolCall} />
    return msg.parentAgent ? (
      <div className="ml-4 border-l-2 border-primary/20 pl-3 my-1">
        <ToolBubble tc={msg.toolCall} />
      </div>
    ) : <ToolBubble tc={msg.toolCall} />
  }

  return (
    <div className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
      <div className={`min-w-0 ${msg.role === 'user' ? 'max-w-[85%]' : 'max-w-full flex-1'}`}>
        {msg.role === 'user' ? (
          <div>
            <div className="rounded-lg bg-gray-100 px-4 py-2.5 text-sm text-black">
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
            {msg.attachments && msg.attachments.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1 justify-end">
                {msg.attachments.map((att, i) => (
                  <AttachmentChip key={i} att={att} />
                ))}
              </div>
            )}
          </div>
        ) : msg.modelName?.startsWith('Agent:') ? (
          // Agent 子对话输出：独立视觉容器 + 实时流式
          <div className="rounded-lg border border-border bg-card overflow-x-hidden"
            onClick={e => {
              const t = e.target as HTMLElement
              if (t.tagName === 'A' && (t as HTMLAnchorElement).href) {
                e.preventDefault()
                ;(window as any).electronAPI?.shell?.openExternal((t as HTMLAnchorElement).href)
              }
            }}
          >
            <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1.5 bg-muted/30">
              <MessageSquare className="h-3 w-3 text-primary/50" />
              <span className="text-[11px] font-medium text-primary/70">{msg.modelName}</span>
              {msg.streaming && <span className="text-[10px] text-muted-foreground/50">输出中...</span>}
              <div className="flex-1" />
            </div>
            <div className="px-3 py-2">
              <ThinkingBlock thinking={msg.thinking || ''} loading={msg.thinkingLoading} content={msg.content || ''} duration={msg.thinkingDuration} />
              {msg.streaming && !msg.content && !msg.agentTimeline?.length && !msg.thinking && (
                <div className="py-3 select-none">
                  <div className="flex gap-[3px]">
                    {Array.from({ length: 4 }, (_, i) => (
                      <span
                        key={i}
                        className={`inline-block ${i % 2 === 0 ? 'bg-foreground' : 'bg-muted-foreground/50'}`}
                        style={{
                          width: '3px', height: '3px',
                          animation: 'pixel-flicker 2s ease-in-out infinite',
                          animationDelay: `${i * 0.18}s`,
                          borderRadius: '0.5px',
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
              {/* 时间线模式：文字和工具调用按顺序穿插 */}
              {msg.agentTimeline && msg.agentTimeline.length > 0 ? (
                <div className="space-y-2">
                  {msg.agentTimeline.map((item, i) =>
                    item.type === 'text' ? (
                      <MarkdownPreview key={i}
                        source={item.content}
                        style={{ fontSize: 14, backgroundColor: 'transparent', overflowWrap: 'break-word', wordBreak: 'break-word' }}
                      />
                    ) : (
                      <AgentToolCallItem key={i} tc={{ name: item.name, brief: item.brief, status: item.status, output: item.output }} />
                    )
                  )}
                </div>
              ) : (
                (!msg.streaming || msg.content) && (
                  <ContentBlock
                    source={msg.content || ''}
                    style={{ fontSize: 14, backgroundColor: 'transparent', overflowWrap: 'break-word', wordBreak: 'break-word' }}
                  />
                )
              )}
            </div>
            {msg.trace && !msg.streaming && (
              <p className="px-3 pb-1.5 text-[10px] text-muted-foreground/40 select-none">{msg.trace}</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-hidden"
            onClick={e => {
              const t = e.target as HTMLElement
              if (t.tagName === 'A' && (t as HTMLAnchorElement).href) {
                e.preventDefault()
                ;(window as any).electronAPI?.shell?.openExternal((t as HTMLAnchorElement).href)
              }
            }}
          >
            {/* 时间线模式：thinking + text 按实际发生顺序渲染 */}
            {msg.mainTimeline && msg.mainTimeline.length > 0 ? (
              <div className="space-y-1">
                {msg.mainTimeline.map((item, i) => {
                  const isLast = i === msg.mainTimeline!.length - 1
                  return item.type === 'thinking' ? (
                    <ThinkingBlock
                      key={i}
                      thinking={item.content}
                      loading={!!(msg.streaming && isLast)}
                      duration={msg.thinkingDuration}
                    />
                  ) : (
                    <ContentBlock
                      key={i}
                      source={item.content}
                      style={{ fontSize: 14, backgroundColor: 'transparent', overflowWrap: 'break-word', wordBreak: 'break-word' }}
                    />
                  )
                })}
              </div>
            ) : (
              /* 兼容旧消息：无时间线时用 thinking + content 字段 */
              <>
                <ThinkingBlock thinking={msg.thinking || ''} loading={msg.thinkingLoading} content={msg.content || ''} duration={msg.thinkingDuration} />
                {msg.streaming && !msg.content && !msg.thinking && (
                  <div className="py-3 select-none">
                    <div className="flex gap-[3px]">
                      {Array.from({ length: 4 }, (_, i) => (
                        <span
                          key={i}
                          className={`inline-block ${i % 2 === 0 ? 'bg-foreground' : 'bg-muted-foreground/50'}`}
                          style={{
                            width: '3px', height: '3px',
                            animation: 'pixel-flicker 2s ease-in-out infinite',
                            animationDelay: `${i * 0.18}s`,
                            borderRadius: '0.5px',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {(!msg.streaming || msg.content) && (
                  <ContentBlock
                    source={msg.content || ''}
                    style={{ fontSize: 14, backgroundColor: 'transparent', overflowWrap: 'break-word', wordBreak: 'break-word' }}
                  />
                )}
              </>
            )}
            {msg.trace && !msg.streaming && (
              <p className="mt-0.5 text-[10px] text-muted-foreground/40 select-none">{msg.trace}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** 工具调用气泡 */
function ToolBubble({ tc }: { tc: ToolCallStatus }) {
  const style = TOOL_STYLE[tc.type] ?? TOOL_STYLE.mcp
  const isError = tc.status === 'error'
  const [expanded, setExpanded] = useState(false)
  const [sandboxExpanded, setSandboxExpanded] = useState(false)
  const hasResult = !!tc.result && tc.result.length > 0

  // 工具完成时默认收起
  useEffect(() => {
    if (tc.status === 'done') setExpanded(false)
  }, [tc.status])

  return (
    <div className="flex gap-3 w-full">
      <div className="min-w-0 flex-1">
        <div
          className={`pt-0.5 pb-1.5 text-xs overflow-hidden w-full ${
            isError
              ? 'border-l-2 border-destructive/40 pl-2 text-destructive'
              : ''
          }`}
        >
          {/* 头部：icon + 标签/名称/状态 */}
          <div className="flex items-start gap-2">
            {isError ? (
              <X className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
            ) : (
              <style.icon className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
            )}
            <div className="min-w-0 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                <style.labelIcon className="h-3 w-3" />
                {style.label}
              </span>
              <span className="font-mono font-medium text-[11px]">{tc.name}</span>
              <span className={`text-[10px] ${isError ? 'text-destructive' : 'text-muted-foreground'}`}>
                {isError ? '失败' : tc.status === 'running' ? '执行中' : '完成'}
              </span>
            </div>
          </div>

          {/* 沙箱入参：默认收起 */}
          {tc.type === 'sandbox' && tc.input != null && (() => {
            const code = String(
              typeof tc.input === 'object' && (tc.input as any).code
                ? (tc.input as any).code
                : JSON.stringify(tc.input)
            )
            return (
              <>
                <button
                  className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  onClick={() => setSandboxExpanded(!sandboxExpanded)}
                >
                  <ChevronDown className={`h-3 w-3 transition-transform ${sandboxExpanded ? 'rotate-180' : ''}`} />
                  {sandboxExpanded ? '收起代码' : `展开代码（${code.length} 字符）`}
                </button>
                {sandboxExpanded && (
                  <pre className="mt-1 max-h-60 overflow-auto custom-scrollbar rounded border border-border px-2 py-1 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all bg-muted/30 text-muted-foreground">
                    {code}
                  </pre>
                )}
              </>
            )
          })()}

          {/* 工具结果：默认收起，点击展开 */}
          {hasResult && (
            <>
              <button
                className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                onClick={() => setExpanded(!expanded)}
              >
                <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                {expanded ? '收起' : `展开结果（${(tc.result!.length / 1000).toFixed(1)}k 字符）`}
              </button>
              {expanded && (
                <div className="mt-1 max-h-60 overflow-auto custom-scrollbar rounded border border-border max-w-full">
                  <MarkdownPreview
                    source={formatToolResult(tc.result!, tc.type)}
                    style={{ fontSize: 12, padding: '4px 8px', backgroundColor: 'transparent' }}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ====== 记忆工具专用组件 ======

const MEMORY_TYPE_META: Record<string, { label: string; cls: string }> = {
  user: { label: '用户', cls: 'text-amber-500/70 bg-amber-500/5 border-amber-500/15' },
  project: { label: '项目', cls: 'text-blue-500/70 bg-blue-500/5 border-blue-500/15' },
  reference: { label: '参考', cls: 'text-emerald-500/70 bg-emerald-500/5 border-emerald-500/15' },
}

/** 统一的记忆卡片容器：左侧细线 + 圆角卡片 */
function MemoryCard({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex gap-2.5 max-w-full">
      <div className={`w-px shrink-0 self-stretch rounded-full ${muted ? 'bg-border/30' : 'bg-border/50'}`} />
      <div className={`min-w-0 flex-1 rounded-lg border px-3 py-2 ${
        muted ? 'border-border/40 bg-card/30' : 'border-border/50 bg-card/40'
      }`}>
        {children}
      </div>
    </div>
  )
}

/** 记忆操作头部行：icon + slug + type badge + status */
function MemoryHeader({ icon: Icon, name, type, status, extra }: {
  icon: typeof Brain
  name: string
  type?: string
  status: string
  extra?: React.ReactNode
}) {
  const meta = type ? MEMORY_TYPE_META[type] : null
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
      <span className="font-mono text-[11px] font-medium truncate">{name || '?'}</span>
      {meta && (
        <span className={`inline-flex items-center rounded border px-1.5 py-px text-[9px] font-medium shrink-0 ${meta.cls}`}>
          {meta.label}
        </span>
      )}
      {extra}
      <span className="text-[9px] text-muted-foreground/30 ml-auto shrink-0">{status}</span>
    </div>
  )
}

function MemoryBubble({ tc }: { tc: ToolCallStatus }) {
  const input = (tc.input || {}) as Record<string, any>

  switch (tc.name) {
    case 'memory_write':
      return <MemoryWriteBubble tc={tc} input={input} />
    case 'memory_read':
      return <MemoryReadBubble tc={tc} input={input} />
    case 'memory_list':
      return <MemoryListBubble tc={tc} />
    case 'memory_delete':
      return <MemoryDeleteBubble tc={tc} input={input} />
    default:
      return <ToolBubble tc={tc} />
  }
}

/** memory_write */
function MemoryWriteBubble({ tc, input }: { tc: ToolCallStatus; input: Record<string, any> }) {
  const [expanded, setExpanded] = useState(false)
  const isUpdate = tc.result?.includes('已更新')
  const type = (input.type as string) || 'user'
  const body = (input.body as string) || ''

  useEffect(() => { if (tc.status === 'done') setExpanded(false) }, [tc.status])

  return (
    <MemoryCard>
      <MemoryHeader icon={Bookmark} name={input.name} type={type} status={isUpdate ? '已更新' : '已写入'} />
      {input.description && (
        <p className="mt-1 text-[11px] text-muted-foreground/50 leading-relaxed line-clamp-2">{input.description}</p>
      )}
      {body && (
        <>
          <button
            className="flex items-center gap-1 mt-1.5 text-[9px] text-muted-foreground/35 hover:text-muted-foreground/55 transition-colors"
            onClick={() => setExpanded(!expanded)}
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            {expanded ? '收起' : '预览内容'}
          </button>
          {expanded && (
            <pre className="mt-1 max-h-40 overflow-auto custom-scrollbar rounded border border-border/30 bg-muted/20 p-2 text-[11px] leading-relaxed whitespace-pre-wrap break-all text-muted-foreground/60">
              {body}
            </pre>
          )}
        </>
      )}
    </MemoryCard>
  )
}

/** memory_read */
function MemoryReadBubble({ tc, input }: { tc: ToolCallStatus; input: Record<string, any> }) {
  const [expanded, setExpanded] = useState(false)
  const result = tc.result || ''
  const fmMatch = result.match(/^---\n([\s\S]*?)\n---\n?/)
  const fm: Record<string, string> = {}
  if (fmMatch) {
    for (const line of fmMatch[1].split('\n')) {
      const kv = line.match(/^(\w+):\s*(.+)/)
      if (kv) fm[kv[1]] = kv[2].trim()
    }
  }
  const body = fmMatch ? result.slice(fmMatch[0].length).trim() : result
  const isNotFound = result.startsWith('未找到记忆')

  useEffect(() => { if (tc.status === 'done') setExpanded(false) }, [tc.status])

  if (isNotFound) {
    return (
      <MemoryCard muted>
        <MemoryHeader icon={Brain} name={input.name} status="未找到" />
      </MemoryCard>
    )
  }

  return (
    <MemoryCard>
      <MemoryHeader icon={Brain} name={fm.name || input.name} type={fm.type || 'user'} status="已读取" />
      {/* 元数据副行：description + links */}
      {(fm.description || (fm.links && fm.links !== '(none)')) && (
        <div className="flex items-center gap-2 mt-0.5 text-[9px] text-muted-foreground/30 font-mono">
          {fm.description && <span className="truncate">{fm.description}</span>}
          {fm.links && fm.links !== '(none)' && <span className="truncate">→ {fm.links}</span>}
        </div>
      )}
      {body && (
        <>
          <div className={`mt-1.5 text-[12px] leading-relaxed text-muted-foreground/75 ${expanded ? '' : 'line-clamp-3'}`}>
            <MarkdownPreview source={body} style={{ fontSize: 12, backgroundColor: 'transparent', padding: 0 }} />
          </div>
          {body.split('\n').length > 3 && (
            <button
              className="flex items-center gap-1 mt-1 text-[9px] text-muted-foreground/35 hover:text-muted-foreground/55 transition-colors"
              onClick={() => setExpanded(!expanded)}
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              {expanded ? '收起' : '展开全部'}
            </button>
          )}
        </>
      )}
    </MemoryCard>
  )
}

/** memory_list */
function MemoryListBubble({ tc }: { tc: ToolCallStatus }) {
  const result = tc.result || ''
  const isEmpty = result === '（无记忆）' || !result.trim()

  if (isEmpty) {
    return (
      <MemoryCard muted>
        <MemoryHeader icon={Brain} name="" status="暂无记忆" />
      </MemoryCard>
    )
  }

  const items = result.split('\n').filter(Boolean).map(line => {
    const m = line.match(/^-\s+(.+?)\s+\(`(.+?)`\):\s*(.*)/)
    return m ? { title: m[1], slug: m[2], hook: m[3] } : null
  }).filter(Boolean) as Array<{ title: string; slug: string; hook: string }>

  return (
    <MemoryCard>
      <div className="flex items-center gap-2 mb-1.5">
        <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
        <span className="text-[11px] text-muted-foreground/60">{items.length} 条记忆</span>
      </div>
      <div className="divide-y divide-border/30">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2 py-1.5 first:pt-0 last:pb-0">
            <span className="text-[11px] font-medium text-muted-foreground/70 truncate max-w-[100px]">{item.title}</span>
            <span className="font-mono text-[10px] text-muted-foreground/35 truncate">{item.slug}</span>
            <span className="text-[10px] text-muted-foreground/25 truncate hidden sm:inline flex-1 text-right">— {item.hook}</span>
          </div>
        ))}
      </div>
    </MemoryCard>
  )
}

/** memory_delete */
function MemoryDeleteBubble({ tc, input }: { tc: ToolCallStatus; input: Record<string, any> }) {
  const isNotFound = tc.result?.startsWith('未找到记忆')
  return (
    <MemoryCard muted={isNotFound}>
      <MemoryHeader icon={Trash2} name={input.name} status={isNotFound ? '未找到' : '已删除'} />
    </MemoryCard>
  )
}

/** 附件 chip */
function AttachmentChip({ att }: { att: MessageAttachment }) {
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] ${
        att.status === 'error'
          ? 'border-destructive/30 bg-destructive/5 text-destructive'
          : 'border-border bg-card text-muted-foreground'
      }`}
      title={att.error}
    >
      {att.type === 'image' ? (
        <Image className="h-3 w-3" />
      ) : (
        <FileText className="h-3 w-3" />
      )}
      <span className="max-w-[100px] truncate">{att.name}</span>
    </div>
  )
}

/** Agent 工具调用条目 */
function AgentToolCallItem({ tc }: { tc: AgentToolCallEntry }) {
  const [expanded, setExpanded] = useState(false)
  const isRunning = tc.status === 'running'
  const isOk = tc.status === 'ok'

  return (
    <div className={`rounded-md border text-xs overflow-hidden ${
      isRunning ? 'border-yellow-500/30 bg-yellow-500/5' :
      isOk ? 'border-border bg-card' :
      'border-destructive/30 bg-destructive/5'
    }`}>
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        {isRunning ? (
          <Loader2 className="h-3 w-3 text-yellow-500 animate-spin shrink-0" />
        ) : isOk ? (
          <Check className="h-3 w-3 text-green-500 shrink-0" />
        ) : (
          <X className="h-3 w-3 text-destructive shrink-0" />
        )}
        <span className="font-medium truncate">{tc.name}</span>
        {tc.brief ? <span className="text-muted-foreground/50 truncate">({tc.brief})</span> : null}
        <span className={`ml-auto shrink-0 text-[10px] ${
          isRunning ? 'text-yellow-600' : isOk ? 'text-green-600' : 'text-destructive'
        }`}>
          {isRunning ? '执行中' : isOk ? '完成' : '失败'}
        </span>
        {tc.output && (
          <button
            className="ml-1 p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0"
            onClick={() => setExpanded(!expanded)}
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {expanded && tc.output && (
        <div className="border-t border-border/50">
          <pre className="max-h-32 overflow-auto custom-scrollbar px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-muted-foreground bg-muted/20">
            {tc.output}
          </pre>
        </div>
      )}
    </div>
  )
}

/** 思考区块：默认折叠。如果 thinking 和 content 重复（DeepSeek 回显），不渲染 */
function ThinkingBlock({ thinking, loading, content, duration }: { thinking: string; loading?: boolean; content?: string; duration?: number }) {
  const [expanded, setExpanded] = useState(false)
  if (!thinking) return null
  // 去重：如果正文和思考内容一致，隐藏思考块
  if (content && (content.startsWith(thinking) || thinking.startsWith(content))) return null

  return (
    <div className="mb-2">
      <button
        className="flex items-center gap-1.5 w-full py-1 text-left hover:opacity-70 transition-opacity"
        onClick={() => setExpanded(!expanded)}
      >
        <Brain className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
        <span className="text-[11px] text-muted-foreground/50">思考</span>
        {loading ? (
          <>
            <Loader2 className="h-3 w-3 text-muted-foreground/40 animate-spin shrink-0" />
            <span className="text-[10px] text-muted-foreground/40">思考中...</span>
          </>
        ) : duration != null && duration > 0 ? (
          <span className="text-[10px] text-muted-foreground/40">{duration}s</span>
        ) : null}
        <div className="flex-1" />
        <ChevronDown className={`h-3 w-3 text-muted-foreground/30 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="py-1 max-h-64 overflow-auto custom-scrollbar">
          <MarkdownPreview
            source={thinking}
            style={{ fontSize: 12, backgroundColor: 'transparent', color: 'var(--muted-foreground)', opacity: loading ? 0.7 : 0.5 }}
          />
        </div>
      )}
    </div>
  )
}

/** 文件操作气泡（确认/结果展示） */
function FileOpBubble({ fo }: { fo: FileOpRequest }) {
  const icon = fo.status === 'done' ? <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
    : fo.status === 'error' ? <X className="h-3.5 w-3.5 text-destructive shrink-0" />
    : fo.status === 'rejected' ? <X className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
    : <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

  return (
    <div className="flex gap-3 max-w-full">
      <div className="min-w-0 flex-1">
        <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs overflow-hidden">
          <div className="flex items-center gap-2">
            {icon}
            <span className="font-mono text-[11px] truncate">
              {fo.type === 'write' ? '✎' : '✕'} {fo.path}
            </span>
            <span className="text-[10px] text-muted-foreground shrink-0">
              {fo.status === 'pending_confirm' ? '待确认'
                : fo.status === 'done' ? (fo.size != null ? `${fo.size} 字符` : fo.type === 'delete' ? '已删除' : '已完成')
                : fo.status === 'error' ? '失败'
                : '已拒绝'}
            </span>
          </div>

          {fo.status === 'pending_confirm' && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <button className="flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-[10px] text-primary-foreground hover:bg-primary/90 transition-colors"
                onClick={async () => { const { confirmFileOp } = await import('@/lib/fileOpManager'); confirmFileOp(fo.id) }}>
                <Check className="h-3 w-3" />允许本次
              </button>
              <button className="flex items-center gap-1 rounded bg-primary/80 px-2.5 py-1 text-[10px] text-primary-foreground hover:bg-primary/70 transition-colors"
                onClick={async () => { const { confirmFileOp } = await import('@/lib/fileOpManager'); confirmFileOp(fo.id, true) }}>
                <Check className="h-3 w-3" />总是允许
              </button>
              <button className="flex items-center gap-1 rounded bg-muted px-2.5 py-1 text-[10px] text-muted-foreground hover:bg-muted/80 transition-colors"
                onClick={async () => { const { rejectFileOp } = await import('@/lib/fileOpManager'); rejectFileOp(fo.id) }}>
                <X className="h-3 w-3" />拒绝
              </button>
            </div>
          )}

          {fo.status === 'error' && fo.error && (
            <div className="mt-1 text-[10px] text-destructive font-mono">{fo.error}</div>
          )}
        </div>
      </div>
    </div>
  )
}

/** 检测文本是否包含 unified diff */
const DIFF_HEADER_RE = /^(diff --git|---\+\+\+|@@\s+-)/m
function isDiffContent(text: string): boolean {
  return DIFF_HEADER_RE.test(text) && text.split('\n').some(l => l.startsWith('+') || l.startsWith('-'))
}

/** 单个文件 diff 块 */
function DiffFileBlock({ lines: allLines }: { lines: string[] }) {
  const [expanded, setExpanded] = useState(false)
  // 提取文件名
  const diffLine = allLines.find(l => l.startsWith('diff --git '))
  const bFile = diffLine?.match(/b\/(\S+)/)?.[1] || ''
  const aFile = diffLine?.match(/a\/(\S+)/)?.[1] || ''
  const filename = bFile || aFile

  // 统计 +/- 行数（排除元数据行）
  const contentLines = allLines.filter(l => !l.startsWith('diff ') && !l.startsWith('index ') && !l.startsWith('---') && !l.startsWith('+++') && l !== '')
  const adds = contentLines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length
  const dels = contentLines.filter(l => l.startsWith('-') && !l.startsWith('---')).length

  // 渲染行：去掉 git 元数据
  const renderLines = allLines.filter(l => {
    if (l.startsWith('diff --git ')) return false
    if (l.startsWith('index ')) return false
    if (l.startsWith('--- ') || l.startsWith('+++ ')) return false
    return true
  })

  const isLong = renderLines.length > 20
  const display = isLong && !expanded ? renderLines.slice(0, 15) : renderLines

  // 计算行号
  let oldNum = 0, newNum = 0
  const lineNums: Array<{ old: number | null; new: number | null }> = []
  for (const line of renderLines) {
    const m = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/)
    if (m) { oldNum = parseInt(m[1]); newNum = parseInt(m[2]); lineNums.push({ old: null, new: null }); continue }
    const isAdd = line.startsWith('+') && !line.startsWith('+++')
    const isDel = line.startsWith('-') && !line.startsWith('---')
    lineNums.push({ old: isAdd ? null : oldNum++, new: isDel ? null : newNum++ })
  }

  return (
    <div className="border-b border-border/50 last:border-b-0">
      {/* 文件名标题栏 */}
      {filename && (
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-muted/30 text-[9px] font-medium text-muted-foreground/60">
          <span className="font-mono truncate">{filename}</span>
          <span className="text-emerald-600/70 ml-auto">+{adds}</span>
          <span className="text-red-400/70">−{dels}</span>
        </div>
      )}
      {display.map((line, i) => {
        const isAdd = line.startsWith('+') && !line.startsWith('+++')
        const isDel = line.startsWith('-') && !line.startsWith('---')
        const isHdr = line.startsWith('@@')
        if (isHdr) return null // 隐藏 hunk 头
        const nums = lineNums[i]
        const prefix = line.slice(0, 1)
        const rowCls = isAdd ? 'bg-zinc-800 text-zinc-200'
          : isDel ? 'bg-zinc-100 text-zinc-400 line-through'
          : ''
        return (
          <div key={i} className={`flex items-baseline pl-0 pr-1 py-0 leading-snug ${rowCls}`}>
            <span className="shrink-0 text-[9px] text-zinc-600 select-none min-w-[2.5rem]">
              <span className="inline-block w-5 text-right">{nums ? `${nums.old ?? nums.new ?? ''}` : ''}</span>
              <span className={`inline-block w-3 text-center font-semibold ${isAdd ? 'text-zinc-400' : isDel ? 'text-zinc-300' : 'text-zinc-500'}`}>{prefix}</span>
            </span>
            <span className="whitespace-pre-wrap break-all">{line.slice(1) || ' '}</span>
          </div>
        )
      })}
      {isLong && !expanded && (
        <div className="relative"><div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-card to-transparent pointer-events-none" /></div>
      )}
      {isLong && (
        <button className="flex items-center gap-1 w-full px-3 py-1.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/30 transition-colors"
          onClick={() => setExpanded(!expanded)}>
          <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          {expanded ? '收起' : `展开全部（${renderLines.length} 行）`}
        </button>
      )}
    </div>
  )
}

/** Diff 内容块：支持多文件，每个文件独立折叠 */
function DiffBlock({ text }: { text: string }) {
  // 按 diff --git 拆分为多个文件
  const sections = text.split(/(?=^diff --git )/m).filter(Boolean)
  if (sections.length <= 1) {
    return (
      <div className="my-1.5 rounded-lg overflow-hidden border border-border font-mono text-xs leading-relaxed bg-card">
        <DiffFileBlock lines={text.split('\n')} />
      </div>
    )
  }
  return (
    <div className="my-1.5 rounded-lg overflow-hidden border border-border font-mono text-xs leading-relaxed bg-card">
      {sections.map((sec, i) => (
        <DiffFileBlock key={i} lines={sec.trim().split('\n')} />
      ))}
    </div>
  )
}

/** 智能渲染：diff 文本用 DiffBlock，其余用 Markdown */
function ContentBlock({ source, style }: { source: string; style?: any }) {
  const blocks: { type: 'md' | 'diff'; content: string }[] = []
  // 按 \`\`\`diff ... \`\`\` 拆分
  const parts = source.split(/(```diff[\s\S]*?```)/g)
  for (const part of parts) {
    if (part.startsWith('```diff')) {
      const inner = part.slice(7, -3).trim()
      blocks.push({ type: 'diff', content: inner })
    } else if (part.trim()) {
      blocks.push({ type: 'md', content: part })
    }
  }
  // 如果没有 diff 代码块，检查是否纯 diff 文本
  if (blocks.length === 0 && isDiffContent(source)) {
    return <DiffBlock text={source} />
  }
  return (
    <>
      {blocks.map((b, i) =>
        b.type === 'diff'
          ? <DiffBlock key={i} text={b.content} />
          : <MarkdownPreview key={i} source={stripHtml(b.content)} style={style} />
      )}
    </>
  )
}

/** 搜索气泡 */
function SearchBubble({ tc }: { tc: ToolCallStatus }) {
  const query = typeof tc.input === 'object' && tc.input ? (tc.input as any).query || '' : ''
  const [expanded, setExpanded] = useState(tc.status === 'running')
  return (
    <div className="flex gap-3 max-w-full">
      <div className="min-w-0 flex-1">
        <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs overflow-hidden">
          <div className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="font-medium truncate">Search: {query}</span>
            <span className="text-[10px] text-muted-foreground/50 shrink-0">{tc.status === 'done' ? 'Done' : tc.status}</span>
          </div>
          {tc.result && (
            <>
              <button className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                onClick={() => setExpanded(!expanded)}>
                <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />{expanded ? 'Collapse' : `Results (${(tc.result.length / 1000).toFixed(1)}k)`}
              </button>
              {expanded && (
                <div className="mt-1 max-h-48 overflow-auto rounded border border-border/50 p-2 text-[11px] whitespace-pre-wrap leading-relaxed text-muted-foreground">{tc.result}</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** 抓取气泡 */
function FetchBubble({ tc }: { tc: ToolCallStatus }) {
  const url = typeof tc.input === 'object' && tc.input ? (tc.input as any).url || '' : ''
  const [expanded, setExpanded] = useState(tc.status === 'running')
  return (
    <div className="flex gap-3 max-w-full">
      <div className="min-w-0 flex-1">
        <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs overflow-hidden">
          <div className="flex items-center gap-2">
            <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="font-medium truncate">Fetch: {url}</span>
            <span className="text-[10px] text-muted-foreground/50 shrink-0">{tc.status === 'done' ? 'Done' : tc.status}</span>
          </div>
          {tc.result && (
            <>
              <button className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                onClick={() => setExpanded(!expanded)}>
                <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />{expanded ? 'Collapse' : `Content (${(tc.result.length / 1000).toFixed(1)}k)`}
              </button>
              {expanded && (
                <div className="mt-1 max-h-48 overflow-auto rounded border border-border/50 p-2 text-[11px] whitespace-pre-wrap leading-relaxed text-muted-foreground">{tc.result}</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** 子任务委托气泡 — 支持流式实时输出 */
function DelegateBubble({ tc }: { tc: ToolCallStatus }) {
  const tier = typeof tc.input === 'object' && tc.input ? (tc.input as any).tier || 'balanced' : 'balanced'
  const task = typeof tc.input === 'object' && tc.input ? (tc.input as any).task || '' : ''
  const [expanded, setExpanded] = useState(tc.status === 'running')
  const outputRef = useRef<HTMLDivElement>(null)
  const tierLabel: Record<string, string> = { fast: 'Fast', balanced: 'Std', powerful: 'Pro' }

  // 去掉模型名头部 [model (tier)]\n
  const displayText = (tc.result || '').replace(/^\[.+?\]\n?/, '')

  // 提取工具调用行 `_调用工具: xxx_` → 染成特殊样式
  const parts = displayText.split(/(_.*调用工具:.*_)/g)

  // 流式时自动滚动
  useEffect(() => {
    if (tc.status === 'running' && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [tc.result, tc.status])

  // 完成后收起
  useEffect(() => {
    if (tc.status === 'done') setExpanded(false)
  }, [tc.status])

  return (
    <div className="flex gap-3 max-w-full">
      <div className={tc.status === 'running' ? 'min-w-0 flex-1' : 'min-w-0'}>
        <div className={`rounded-lg border px-3 py-2 text-xs overflow-hidden ${
          tc.status === 'running' ? 'border-amber-500/30 bg-amber-500/[0.02] w-full' :
          tc.status === 'error' ? 'border-destructive/30 bg-destructive/5' :
          'border-border bg-card inline-block'
        }`}>
          {/* 头部 */}
          <div className="flex items-center gap-2">
            {tc.status === 'running' ? (
              <Loader2 className="h-3.5 w-3.5 text-amber-500 animate-spin shrink-0" />
            ) : (
              <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            )}
            <span className="font-medium truncate">
              {task ? task.slice(0, 50) + (task.length > 50 ? '...' : '') : '子任务'}
            </span>
            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shrink-0">
              {tierLabel[tier] || tier}
            </span>
            <span className={`text-[10px] shrink-0 ${
              tc.status === 'running' ? 'text-amber-500' :
              tc.status === 'error' ? 'text-destructive' : 'text-muted-foreground'
            }`}>
              {tc.status === 'running' ? '执行中...' : tc.status === 'error' ? '失败' : '完成'}
            </span>
          </div>

          {/* 流式输出 / 折叠结果 */}
          {displayText ? (
            tc.status === 'running' ? (
              <div ref={outputRef}
                className="mt-1.5 max-h-64 overflow-auto custom-scrollbar rounded border border-border/50 p-2 text-[11px] leading-relaxed whitespace-pre-wrap break-all text-muted-foreground">
                {parts.map((p, i) =>
                  p.startsWith('_') && p.endsWith('_')
                    ? <span key={i} className="inline-flex items-center gap-1 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1 py-0.5 text-[10px] font-medium">{p.replace(/_/g, '')}</span>
                    : <span key={i}>{p}</span>
                )}
              </div>
            ) : (
              <>
                <button className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  onClick={() => setExpanded(!expanded)}>
                  <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                  {expanded ? '收起' : `展开结果 (${(displayText.length / 1000).toFixed(1)}k)`}
                </button>
                {expanded && (
                  <div className="mt-1 max-h-48 overflow-auto custom-scrollbar rounded border border-border/50 p-2 text-[11px] leading-relaxed whitespace-pre-wrap break-all text-muted-foreground">
                    {parts.map((p, i) =>
                      p.startsWith('_') && p.endsWith('_')
                        ? <span key={i} className="inline-flex items-center gap-1 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1 py-0.5 text-[10px] font-medium">{p.replace(/_/g, '')}</span>
                        : <span key={i}>{p}</span>
                    )}
                  </div>
                )}
              </>
            )
          ) : tc.status === 'running' ? (
            <p className="mt-1.5 text-[10px] text-muted-foreground/40">等待输出...</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** 终端命令气泡 */
export function TerminalBubble({ ts, onConfirm, onReject, onCancel }: {
  ts: TerminalStatus
  onConfirm: (id: string, persist: boolean) => void
  onReject: (id: string) => void
  onCancel: (id: string) => void
}) {
  const iconCls = ts.status === 'done' ? 'text-green-400'
    : ts.status === 'error' ? 'text-red-400'
    : ts.status === 'running' ? 'text-yellow-400 animate-pulse'
    : ts.status === 'cancelled' ? 'text-zinc-500'
    : 'text-zinc-400'

  return (
    <div className="flex gap-3 max-w-full">
      <div className="min-w-0 flex-1">
        <div className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-xs overflow-hidden">
          {/* 头部 */}
          <div className="flex items-center gap-2">
            <Terminal className={`h-3.5 w-3.5 shrink-0 ${iconCls}`} />
            <span className="text-zinc-200 font-mono text-[11px] font-medium truncate">
              <span className="text-green-400 select-none">$ </span>{ts.command}
            </span>
            {ts.async && <span className="text-[9px] rounded bg-yellow-500/20 text-yellow-500 px-1 py-px font-medium shrink-0">异步</span>}
            <span className="text-[10px] text-zinc-500 shrink-0">
              {ts.status === 'pending_confirm' ? '待确认'
                : ts.status === 'running' ? '执行中…'
                : ts.status === 'done' ? `完成 (exit ${ts.exitCode ?? 0})`
                : ts.status === 'error' ? '失败'
                : '已取消'}
            </span>
          </div>

          {/* 确认按钮 */}
          {ts.status === 'pending_confirm' && (
            <div className="flex items-center gap-2 mt-2">
              <button className="flex items-center gap-1 rounded bg-green-700 px-2.5 py-1 text-[10px] text-green-100 hover:bg-green-600 transition-colors"
                onClick={() => onConfirm(ts.id, false)}>
                <Check className="h-3 w-3" />允许本次
              </button>
              <button className="flex items-center gap-1 rounded bg-green-800 px-2.5 py-1 text-[10px] text-green-100 hover:bg-green-700 transition-colors"
                onClick={() => onConfirm(ts.id, true)}>
                <Check className="h-3 w-3" />总是允许
              </button>
              <button className="flex items-center gap-1 rounded bg-zinc-700 px-2.5 py-1 text-[10px] text-zinc-300 hover:bg-zinc-600 transition-colors"
                onClick={() => onReject(ts.id)}>
                <X className="h-3 w-3" />拒绝
              </button>
            </div>
          )}
          {/* 运行中取消按钮 */}
          {ts.status === 'running' && (
            <div className="flex items-center gap-2 mt-2">
              <button className="flex items-center gap-1 rounded bg-red-900/50 px-2.5 py-1 text-[10px] text-red-300 hover:bg-red-800 transition-colors"
                onClick={() => onCancel(ts.id)}>
                <X className="h-3 w-3" />终止 (Ctrl+C)
              </button>
            </div>
          )}

          {/* 输出 */}
          {/* 输出 */}
          {(ts.stdout || ts.stderr) && (
            <TerminalOutput stdout={ts.stdout} stderr={ts.stderr} />
          )}
        </div>
      </div>
    </div>
  )
}

/** 终端输出 — 用 useEffect + RAF 自动跟底，避免 ref callback 每帧触发布局 */
function TerminalOutput({ stdout, stderr }: { stdout: string; stderr?: string }) {
  const ref = useRef<HTMLPreElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
  }, [stdout, stderr])
  return (
    <pre ref={ref} className="mt-2 max-h-96 overflow-auto custom-scrollbar rounded bg-zinc-950 px-2 py-1.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-zinc-300">
      {stdout}{stderr && `\n\x1b[31m${stderr}\x1b[0m`}
    </pre>
  )
}

/** 自定义比较：已完成消息内容不变就跳过渲染（对齐 Codex 不可变历史 cell） */
function areEqual(prev: ChatMessageProps, next: ChatMessageProps) {
  const p = prev.msg, n = next.msg
  // 流式消息始终重渲染
  if (p.streaming || n.streaming) return false
  // 终端消息：状态变化需要重渲染（按钮状态切换）
  if (p.terminal || n.terminal) {
    return p.terminal?.status === n.terminal?.status &&
      p.terminal?.stdout === n.terminal?.stdout &&
      p.terminal?.stderr === n.terminal?.stderr
  }
  // 已完成消息：比较关键字段内容
  return (
    p.content === n.content &&
    p.thinking === n.thinking &&
    p.modelName === n.modelName &&
    p.role === n.role &&
    p.toolCall?.status === n.toolCall?.status &&
    p.toolCall?.result === n.toolCall?.result &&
    JSON.stringify(p.toolBatch) === JSON.stringify(n.toolBatch) &&
    JSON.stringify(p.agentTimeline) === JSON.stringify(n.agentTimeline)
  )
}

export const ChatMessage = memo(ChatMessageInner, areEqual)

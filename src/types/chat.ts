export type ToolType = 'sandbox' | 'skill' | 'agent' | 'mcp' | 'gateway' | 'workspace' | 'delegate'

export interface ToolCallStatus {
  id: string
  name: string
  type: ToolType
  status: 'running' | 'done' | 'error'
  input?: unknown
  result?: string
}

export interface MessageAttachment {
  name: string
  type: 'image' | 'document'
  status: 'done' | 'error'
  error?: string
}

export interface AgentToolCallEntry {
  name: string
  brief: string
  status: 'running' | 'ok' | 'error'
  output?: string
}

export type AgentTimelineItem =
  | { type: 'text'; content: string }
  | { type: 'tool'; name: string; brief: string; status: 'running' | 'ok' | 'error'; output?: string }

/** 主对话时间线项：按实际发生顺序记录 thinking 和 text */
export type MainTimelineItem =
  | { type: 'thinking'; content: string }
  | { type: 'text'; content: string }

/** Git 操作状态 */
export interface GitOpStatus {
  id: string
  command: string          // 如 'git status', 'git commit -m "fix"', 'git push origin main'
  description: string      // 简短描述，如 '查看工作区状态'
  status: 'running' | 'done' | 'error'
  output?: string          // git 命令输出（stdout）
  error?: string           // 错误信息（stderr）
  startTime: number
  endTime?: number
}

/** 工作区操作状态 */
export interface WorkspaceOpStatus {
  id: string
  tool: 'read_file' | 'write_file' | 'edit_file' | 'list_dir' | 'glob' | 'grep' | 'create_dir' | 'delete_file' | 'append_file' | 'move_file' | 'batch_edit' | 'file_info' | 'compare_files' | 'backup_file' | 'restore_file' | 'run_tests'
  path: string             // 操作的文件/目录路径
  status: 'running' | 'done' | 'error'
  output?: string
  error?: string
  startTime: number
  endTime?: number
}

export interface UIMessage {
  id?: string       // 消息唯一标识（reducer 自动分配）
  role: 'user' | 'assistant' | 'tool'
  content: string
  streaming?: boolean
  thinking?: string  // AI 思考过程（reasoning/thinking），流式累积
  thinkingLoading?: boolean  // 思考进行中（reasoning-start 后，reasoning-end 前）
  thinkingDuration?: number  // 思考持续秒数（思考结束后显示）
  toolCall?: ToolCallStatus
  attachments?: MessageAttachment[]
  modelName?: string
  trace?: string  // 可观测性信息
  parentAgent?: string  // 子 Agent 标签，工具消息渲染到 Agent 容器内
  toolBatch?: ToolCallStatus[]          // 并行工具调用组
  agentToolCalls?: AgentToolCallEntry[]  // 保留兼容
  agentTimeline?: AgentTimelineItem[]    // 时间线：文字+工具调用按顺序穿插
  mainTimeline?: MainTimelineItem[]     // 主对话时间线：thinking+text 按实际发生顺序
  terminal?: TerminalStatus             // 终端命令状态
  fileOp?: FileOpRequest               // 文件操作请求
  gitOp?: GitOpStatus                  // Git 操作状态
  githubOp?: GitHubOpStatus            // GitHub 操作状态
  workspaceOp?: WorkspaceOpStatus      // 工作区操作状态
  taskSnapshot?: TaskSnapshot          // 任务列表快照
}

/** GitHub 操作状态 */
export interface GitHubOpStatus {
  id: string
  command: string
  description: string
  status: 'running' | 'done' | 'error'
  output?: string
  error?: string
  startTime: number
  endTime?: number
}

/** 任务列表面板快照 */
export interface TaskSnapshot {
  tasks: Array<{ id: string; title: string; status: string }>
  updatedAt: number
}

export interface ConsoleLine {
  id: number
  time: string
  icon: string
  msg: string
  status: 'ok' | 'running' | 'error' | 'info'
}

/** 终端命令状态 */
export interface TerminalStatus {
  id: string
  command: string
  cwd?: string
  status: 'pending_confirm' | 'running' | 'done' | 'error' | 'cancelled'
  async?: boolean
  stdout: string
  stderr: string
  exitCode?: number
  startTime: number
  endTime?: number
  timeout?: number   // 超时秒数
}

/** 压缩事件数据 */
export interface CompressionEventData {
  wasCompressed: boolean
  originalTokens: number
  compressedTokens: number
  limit: number
  summary?: string
}

import type { FileOpRequest } from '@/lib/fileOpManager'

export function detectToolType(name: string): ToolType {
  if (name.startsWith('sandbox_')) return 'sandbox'
  if (name === 'read_skill') return 'skill'
  if (name === 'delegate_task') return 'delegate'
  if (['ask_user', 'show_progress', 'notify_complete', 'update_task_list'].includes(name))
    return 'agent'
  // MCP 网关工具（目录发现、资源/提示读取）
  if (['mcp_list_resources', 'mcp_read_resource', 'mcp_list_prompts', 'mcp_get_prompt'].includes(name))
    return 'gateway'
  // enable_tool 本质是代理 MCP 业务工具调用，视觉上归类为 MCP
  if (name === 'enable_tool') return 'mcp'
  // Agent 工具（agent__name 格式）
  if (name.startsWith('agent__')) return 'agent'
  // 工作区工具
  if (name.startsWith('workspace_')) return 'workspace'
  // 真正的 MCP 业务工具（serverName__toolName 格式）
  return 'mcp'
}

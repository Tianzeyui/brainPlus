/**
 * Agent 工具：ask_user, show_progress, notify_complete, update_task_list, delegate_task
 */
import { jsonSchema } from '../api'
import type { ToolMap } from './registry'
import type { AskQuestion } from '../chatService'

let onAgentUIEvent: ((event: any) => void) | null = null

export function setAgentToolHandler(handler: ((event: any) => void) | null) {
  onAgentUIEvent = handler
}

// 工具级流式回调（用于 delegate_task/batch 实时输出）
type ToolStreamEvent = { type: 'delta'; toolName: string; text: string; subtaskIndex?: number }
                     | { type: 'tool'; toolName: string; subTool: string; subtaskIndex?: number }
                     | { type: 'done'; toolName: string }
                     | { type: 'subtask_start'; toolName: string; subtaskIndex: number; tier: string; agentType: string }
                     | { type: 'subtask_end'; toolName: string; subtaskIndex: number; text: string; toolCalls: string[]; modelName: string }

let toolStreamHandler: ((e: ToolStreamEvent) => void) | null = null
export function setToolStreamHandler(h: typeof toolStreamHandler) { toolStreamHandler = h }
function emitToolStream(e: ToolStreamEvent) { toolStreamHandler?.(e) }

export function registerAgentTools(tools: ToolMap, autoMode?: boolean) {
  tools['ask_user'] = {
    description:
      '向用户提问以获取决策或补充信息。**优先使用多问题模式一次问清楚**，减少往返。\n' +
      '多问题模式：传入 title 标题 + questions 数组，每个问题可独立设置输入类型(input/select/confirm)。\n' +
      '单问题模式：传入 question + inputType(兼容旧版)。\n' +
      '注意：信息充分时立即执行任务，不要在信息完备时继续提问。',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        title: { type: 'string', description: '表单标题，如"请提供发票查询信息"' },
        questions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '问题唯一标识，如"invoice_code"' },
              label: { type: 'string', description: '问题文本，如"发票代码"' },
              inputType: { type: 'string', enum: ['input', 'select', 'confirm'], description: '输入类型' },
              options: { type: 'array', items: { type: 'string' }, description: 'select/confirm 的选项' },
              placeholder: { type: 'string', description: '输入框提示文字' },
              required: { type: 'boolean', description: '是否必填' },
            },
            required: ['id', 'label', 'inputType'],
          },
          description: '问题列表（多问多答模式，推荐）',
        },
        question: { type: 'string', description: '（旧格式）单个问题文本' },
        options: { type: 'array', items: { type: 'string' }, description: '（旧格式）选项列表' },
        inputType: { type: 'string', enum: ['select', 'input', 'confirm'], description: '（旧格式）交互类型' },
      },
    }),
    execute: async (args: { title?: string; questions?: AskQuestion[]; question?: string; options?: string[]; inputType?: string }) => {
      return new Promise<string>((resolve) => {
        if (onAgentUIEvent) {
          if (args.questions && args.questions.length > 0) {
            onAgentUIEvent({ type: 'ask_user', title: args.title, questions: args.questions, resolve })
          } else {
            onAgentUIEvent({
              type: 'ask_user',
              question: args.question || '请提供信息',
              options: args.options,
              inputType: (args.inputType as 'select' | 'input' | 'confirm') || 'confirm',
              resolve,
            })
          }
        } else {
          resolve('用户不在线，请自行决策。' + (args.options ? ` 可选: ${args.options.join(', ')}` : ''))
        }
      })
    },
  }

  tools['show_progress'] = {
    description:
      '显示长时间任务的进度。调用后告知用户当前进展，避免用户焦虑等待。' +
      'current/total 用于百分比进度，仅传 message 则显示不确定进度条。',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        message: { type: 'string', description: '进度描述，如 "正在生成 PPT 第 2/5 页..."' },
        current: { type: 'number', description: '当前进度（可选）' },
        total: { type: 'number', description: '总进度（可选）' },
      },
      required: ['message'],
    }),
    execute: async (args: { message: string; current?: number; total?: number }) => {
      onAgentUIEvent?.({ type: 'show_progress', message: args.message, current: args.current, total: args.total })
      return '进度已更新'
    },
  }

  tools['notify_complete'] = {
    description:
      '通知用户任务完成。用于异步任务结束时告知结果。' +
      'message 为完成消息，result 为可选的结果摘要（如文件路径、数据统计）。',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        message: { type: 'string', description: '完成消息，如 "PPT 生成完成"' },
        result: { type: 'string', description: '结果摘要（可选），如文件路径' },
      },
      required: ['message'],
    }),
    execute: async (args: { message: string; result?: string }) => {
      onAgentUIEvent?.({ type: 'notify_complete', message: args.message, result: args.result })
      return '已通知用户: ' + args.message
    },
  }

  tools['update_task_list'] = {
    description:
      'Break complex tasks into steps and track progress. Create a list of pending tasks, mark each running when you start, mark it done immediately when complete. ' +
      'Do NOT batch up multiple completed tasks — update status after EACH step finishes. ' +
      'This tool keeps you accountable: you cannot claim a task is done if a step is still pending. ' +
      'id: unique identifier; title: task description; status: pending/running/done/cancelled.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '唯一标识，如 "1"/"2"/"3"' },
              title: { type: 'string', description: '任务描述' },
              status: { type: 'string', enum: ['pending', 'running', 'done', 'cancelled'], description: '任务状态' },
            },
            required: ['id', 'title', 'status'],
          },
        },
      },
      required: ['tasks'],
    }),
    execute: async (args: { tasks: Array<{ id: string; title: string; status: string }> }) => {
      onAgentUIEvent?.({ type: 'update_task_list', tasks: args.tasks.map(t => ({ id: t.id, title: t.title, status: t.status as any })) })
      const done = args.tasks.filter(t => t.status === 'done').length
      return `任务清单已更新 (${done}/${args.tasks.length} 完成)`
    },
  }

  if (autoMode) {
    tools['delegate_task'] = {
      description:
        'Delegate a sub-task to a specialized agent. ' +
        'agentType: general (full tools, default), explore (read-only search), plan (design/review, no edits), verify (find bugs, no edits). ' +
        'tier: "fast" simple, "balanced" daily, "powerful" complex. ' +
        'schema: optional JSON Schema for structured output validation. ' +
        'budget: optional max token limit. ' +
        'Use delegate_batch for parallel or pipeline multi-agent execution.\n' +
        'task 描述要具体，包含原始需求、改动文件列表、采用的方法。',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          tier: { type: 'string', enum: ['fast', 'balanced', 'powerful'], description: 'Model tier, default balanced' },
          agentType: { type: 'string', enum: ['general', 'explore', 'plan', 'verify'], description: 'Agent type: general (full tools), explore (read-only), plan (design), verify (find bugs)' },
          task: { type: 'string', description: 'Sub-task description with context' },
          schema: { type: 'object', description: 'Optional JSON Schema for structured output' },
          budget: { type: 'number', description: 'Optional token budget limit' },
        },
        required: ['task'],
      }),
      execute: async (args: { tier?: string; agentType?: string; task: string; schema?: any; budget?: number; _toolName?: string }) => {
        const toolName = args._toolName || 'delegate_task'
        try {
          const { delegateTask } = await import('../orchestrator')
          const result = await delegateTask(args.task, {
            tier: (args.tier as any) || 'balanced',
            agentType: (args.agentType as any) || 'general',
            schema: args.schema,
            budget: args.budget,
            stream: {
              text: (d: string) => emitToolStream({ type: 'delta', toolName, text: d }),
              toolCall: (n: string) => emitToolStream({ type: 'tool', toolName, subTool: n }),
              done: () => emitToolStream({ type: 'done', toolName }),
            },
          })
          return JSON.stringify({
            __delegate: true,
            tier: args.tier || 'balanced',
            agentType: args.agentType || 'general',
            modelName: result.modelName,
            toolCalls: result.toolCalls || [],
            text: result.text,
          })
        } catch (e: any) {
          return `委托失败: ${e.message}`
        }
      },
    }

    tools['delegate_batch'] = {
      description:
        'Execute multiple sub-tasks in parallel or pipeline mode. ' +
        'mode: parallel (default, independent tasks run simultaneously) or pipeline (sequential, each stage gets previous results as context). ' +
        'Each task supports tier, agentType, schema, and budget.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['parallel', 'pipeline'], description: 'Execution mode: parallel (default) or pipeline (sequential with context)' },
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                tier: { type: 'string', enum: ['fast', 'balanced', 'powerful'], description: 'Model tier' },
                agentType: { type: 'string', enum: ['general', 'explore', 'plan', 'verify'], description: 'Agent type' },
                task: { type: 'string', description: 'Sub-task description' },
              },
              required: ['task'],
            },
          },
        },
        required: ['tasks'],
      }),
      execute: async (args: { mode?: string; tasks: Array<{ tier?: string; agentType?: string; task: string }>; _toolName?: string }) => {
        const toolName = args._toolName || 'delegate_batch'
        const mode = (args.mode || 'parallel') as 'parallel' | 'pipeline'
        try {
          const { delegateBatch } = await import('../orchestrator')
          const results = await delegateBatch(
            args.tasks.map(t => ({ task: t.task, tier: t.tier, agentType: (t.agentType as any) })),
            mode,
            {
              stream: {
                text: (d: string) => emitToolStream({ type: 'delta', toolName, text: d }),
                toolCall: (n: string) => emitToolStream({ type: 'tool', toolName, subTool: n }),
                done: () => {},
                subtaskStart: (idx, tier, agentType) =>
                  emitToolStream({ type: 'subtask_start', toolName, subtaskIndex: idx, tier, agentType }),
                subtaskEnd: (idx, text, toolCalls, modelName) =>
                  emitToolStream({ type: 'subtask_end', toolName, subtaskIndex: idx, text, toolCalls, modelName }),
                subtaskDelta: (idx, delta) =>
                  emitToolStream({ type: 'delta', toolName, text: delta, subtaskIndex: idx }),
              },
            },
          )
          emitToolStream({ type: 'done', toolName })
          return JSON.stringify({
            __delegate_batch: true,
            subTasks: results.map((r, i) => ({
              index: i,
              tier: args.tasks[i]?.tier || 'balanced',
              agentType: args.tasks[i]?.agentType || 'general',
              modelName: r.modelName,
              toolCalls: r.toolCalls || [],
              text: r.text,
            })),
          })
        } catch (e: any) {
          return `委托失败: ${e.message}`
        }
      },
    }
  }
}

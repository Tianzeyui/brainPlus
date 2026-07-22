/**
 * IDE 集成工具：在系统默认应用/IDE 中打开文件
 */
import { jsonSchema } from '../api'
import type { ToolMap } from './registry'

export function registerIdeTools(tools: ToolMap) {
  tools['ide_open_file'] = {
    description:
      'Open a file in the IDE or system default application. ' +
      'path= is required. Optional line= to jump to a specific line. ' +
      'Use this to let the user view a file in their editor.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to open' },
        line: { type: 'number', description: 'Optional line number to jump to' },
      },
      required: ['path'],
    }),
    execute: async (args: { path: string; line?: number }) => {
      const ws = (window as any).electronAPI?.workspace
      if (!ws?.openFile) return 'IDE 集成不可用（仅桌面版本）'
      try {
        await ws.openFile(args.path)
        const lineHint = args.line ? `:${args.line}` : ''
        return `已在 IDE 中打开 ${args.path}${lineHint}`
      } catch (e: any) {
        return `打开失败: ${e.message}`
      }
    },
  }
}

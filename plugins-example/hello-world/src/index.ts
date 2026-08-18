/**
 * hello-world — 示例插件（新范式）
 *
 * HOST 半端：注册一个 AI 工具（主进程执行）
 * CLIENT 半端：自带 React 页面（见 src/client.tsx）
 */
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'hello-world'
export const inject = ['tools']
export const provide = []

export function apply(ctx: any) {
  ctx.tools.register(defineTool({
    name: 'hello_world',
    description: '示例工具：返回 Hello World 消息',
    parameters: {
      name: { type: 'string', required: false, description: '你的名字（可选）' },
    },
    output: {
      schema: { type: 'string' },
      render: (_a: any, v: string) => [{ type: 'text', text: v }],
    },
    execute: (args: { name?: string }) => {
      return args.name ? `Hello, ${args.name}! 来自新范式插件 hello-world` : 'Hello, World! 来自新范式插件 hello-world'
    },
  }))

  ctx.logger?.info('[hello-world] HOST 半端已激活')
}

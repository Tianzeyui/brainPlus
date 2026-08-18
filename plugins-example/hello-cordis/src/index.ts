/**
 * hello-cordis — 新范式示范插件（对齐 DSH/Cordis）
 *
 * 插件形态：
 *   - name/inject/provide/apply(ctx)  （Cordis 插件规范）
 *   - ctx.tools.register + defineTool 注册 AI 工具（主进程执行）
 *   - ctx.provide 注册服务（其他插件可 ctx.get 获取）
 *   - ctx.effect 生命周期清理
 *
 * 构建：本文件是源码，发布时用 esbuild 预编译为 lib/index.js（CJS）
 *   插件安装的是 lib/index.js，运行时零编译零 spawn。
 */
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'hello-cordis'
export const inject = ['tools', 'sidecar']
export const provide = ['greeter']

export function apply(ctx: any) {
  // ---- 注册 AI 工具（模型在主进程可直接调用） ----
  const unregisterTool = ctx.tools.register(defineTool({
    name: 'hello_greet',
    description: '向某人打招呼（Cordis 新范式示例工具）',
    parameters: {
      who: { type: 'string', required: true, description: '打招呼的对象' },
    },
    output: {
      schema: { type: 'string' },
      render: (args: any, value: any) => [{ type: 'text', text: value }],
    },
    execute: (args: { who: string }) => {
      return `Hello, ${args.who}! 来自 Cordis 插件 ${name}`
    },
  }))

  // ---- 注册服务（其他插件可 ctx.get('greeter')） ----
  const disposer = ctx.provide('greeter', {
    greet: (who: string) => `Hello, ${who}!`,
    describe: () => ({ plugin: name, runtime: 'cordis' }),
  })

  // ---- 生命周期清理 ----
  ctx.effect(() => {
    ctx.logger?.info(`[${name}] 已激活`)
    return () => {
      unregisterTool()
      disposer()
      ctx.logger?.info(`[${name}] 已清理`)
    }
  }, `${name} lifecycle`)
}

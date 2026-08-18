/**
 * hello-world — 基准测试插件（新范式，对齐 DSH/Cordis）
 *
 * 演示新范式下各项能力：
 *   HOST 半端：
 *     - 多个 AI 工具（基础/宿主服务调用/生命周期演示）
 *     - 服务注册（ctx.provide）+ 插件间互通（ctx.get）
 *     - 生命周期清理（ctx.effect）
 *   CLIENT 半端：自带 React 页面（见 src/client.tsx）
 */
export const name = 'hello-world'
export const inject = ['tools', 'sidecar', 'fs']
export const provide = ['helloService']

export function apply(ctx: any) {
  const defineTool = ctx.get('defineTool')

  // ====== 工具 1：基础 ======
  ctx.tools.register(defineTool({
    name: 'hello_world',
    description: '基准测试工具1：基础字符串处理。验证插件工具注册/执行链路。',
    parameters: {
      name: { type: 'string', description: '你的名字（可选）' },
    },
    output: {
      schema: { type: 'string' },
      render: (_a: any, v: string) => [{ type: 'text', text: v }],
    },
    execute: (args: { name?: string }) => {
      return args.name ? `Hello, ${args.name}! 来自新范式插件 hello-world` : 'Hello, World! 来自新范式插件 hello-world'
    },
  }))

  // ====== 工具 2：宿主服务（sidecar） ======
  ctx.tools.register(defineTool({
    name: 'hello_sidecar',
    description: '基准测试工具2：调用宿主 sidecar 服务（主进程能力）。验证 ctx.get("sidecar")。',
    parameters: {
      method: { type: 'string', description: 'sidecar 方法名（如 fs.listDir）' },
    },
    output: {
      schema: { type: 'string' },
      render: (_a: any, v: string) => [{ type: 'text', text: v }],
    },
    execute: async (args: { method?: string }) => {
      try {
        const sidecar = ctx.get('sidecar')
        if (!sidecar) return 'sidecar 服务不可用'
        const result = await sidecar.call(args.method || 'fs.listDir', {})
        return JSON.stringify(result).slice(0, 500)
      } catch (e: any) {
        return `sidecar 调用失败: ${e.message}`
      }
    },
  }))

  // ====== 工具 3：宿主服务（fs） ======
  ctx.tools.register(defineTool({
    name: 'hello_fs',
    description: '基准测试工具3：宿主 fs 服务。验证 ctx.get("fs") 文件读取。',
    parameters: {
      path: { type: 'string', required: true, description: '文件路径' },
    },
    output: {
      schema: { type: 'string' },
      render: (_a: any, v: string) => [{ type: 'text', text: v }],
    },
    execute: async (args: { path: string }) => {
      try {
        const fsSvc = ctx.get('fs')
        if (!fsSvc) return 'fs 服务不可用'
        const result = await fsSvc.readFile(args.path)
        return JSON.stringify(result).slice(0, 500)
      } catch (e: any) {
        return `fs 调用失败: ${e.message}`
      }
    },
  }))

  // ====== 服务注册（其他插件可 ctx.get('helloService')） ======
  const disposer = ctx.provide('helloService', {
    greet: (who: string) => `Hello, ${who}! (来自 helloService)`,
    describe: () => ({
      plugin: 'hello-world',
      runtime: 'cordis',
      tools: ['hello_world', 'hello_sidecar', 'hello_fs'],
    }),
  })

  // ====== 生命周期 ======
  ctx.effect(() => {
    ctx.logger?.info('[hello-world] 已激活')
    return () => {
      disposer()
      ctx.logger?.info('[hello-world] 已清理')
    }
  }, 'hello-world lifecycle')

  ctx.logger?.info('[hello-world] HOST 半端已激活（3 个工具 + 1 个服务）')
}

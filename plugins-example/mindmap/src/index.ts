/**
 * mindmap — 思维导图插件（新范式）
 *
 * HOST 半端：AI 工具在主进程执行（ctx.get('supabase')）
 */
export const name = 'mindmap'
export const inject = ['tools', 'supabase']
export const provide = []

export function apply(ctx: any) {
  const defineTool = ctx.get('defineTool')

  function getSB() {
    const sb = ctx.get('supabase')
    if (!sb) throw new Error('Supabase 未配置')
    return sb
  }

  ctx.tools.register(defineTool({
    name: 'mindmap_list',
    description: '列出当前用户的所有思维导图及其节点结构。',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_a: any, v: string) => [{ type: 'text', text: v }],
    },
    execute: async () => {
      try {
        const sb = getSB()
        const { data: maps, error } = await sb.from('mindmaps').select('id,name,updated_at').order('updated_at', { ascending: false })
        if (error) throw error
        if (!maps || maps.length === 0) return '暂无思维导图。'
        return (maps as any[]).map((m: any) =>
          `- ${m.name} (${m.id.slice(0, 8)}) | ${new Date(m.updated_at).toLocaleString('zh-CN')}`
        ).join('\n')
      } catch (e: any) { return '查询失败: ' + e.message }
    },
  }))

  ctx.logger?.info('[mindmap] HOST 半端已激活')
}

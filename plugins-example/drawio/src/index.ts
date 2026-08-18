/**
 * drawio — drawio 图表插件（新范式）
 *
 * HOST 半端：AI 工具在主进程执行（ctx.get('supabase')）
 * 包含：list/get/export 查询类工具；display/open（UI 操作）暂未迁移
 */
export const name = 'drawio'
export const inject = ['tools', 'supabase']
export const provide = []

export function apply(ctx: any) {
  const defineTool = ctx.get('defineTool')

  function getSB() {
    const sb = ctx.get('supabase')
    if (!sb) throw new Error('Supabase 未配置')
    return sb
  }

  async function _listDiagrams(): Promise<any[]> {
    const sb = getSB()
    const { data, error } = await sb.from('drawio_diagrams').select('id,name,updated_at').order('updated_at', { ascending: false })
    if (error) throw error
    return data || []
  }

  async function _getDiagram(id: string): Promise<any> {
    const sb = getSB()
    const { data, error } = await sb.from('drawio_diagrams').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    if (!data) throw new Error(`未找到图表 id=${id}`)
    return data
  }

  ctx.tools.register(defineTool({
    name: 'drawio_list',
    description: '列出当前用户的所有 draw.io 图表。返回图表 id、名称和更新时间。需要查看或编辑某个图表时先调用此工具。',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_a: any, v: string) => [{ type: 'text', text: v }],
    },
    execute: async () => {
      try {
        const diagrams = await _listDiagrams()
        if (diagrams.length === 0) return '暂无图表。'
        return diagrams.map((d: any) =>
          `- ${d.name} (${d.id.slice(0, 8)}) | ${new Date(d.updated_at).toLocaleString('zh-CN')}`
        ).join('\n')
      } catch (e: any) { return '获取图表列表失败: ' + e.message }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'drawio_get',
    description: '获取指定图表的完整 XML 内容。支持前 8 位短 id 匹配。',
    parameters: {
      id: { type: 'string', required: true, description: '图表 id，支持前 8 位短 id' },
    },
    output: {
      schema: { type: 'string' },
      render: (_a: any, v: string) => [{ type: 'text', text: v }],
    },
    execute: async (args: { id: string }) => {
      try {
        let d
        if (args.id.length < 36) {
          const list = await _listDiagrams()
          d = list.find((item: any) => item.id.startsWith(args.id))
          if (!d) return `未找到 id=${args.id.slice(0, 8)} 的图表。`
        } else {
          d = await _getDiagram(args.id)
        }
        return [
          `## ${d.name}`,
          `更新时间: ${new Date(d.updated_at).toLocaleString('zh-CN')}`,
          '',
          '```xml',
          d.xml,
          '```',
        ].join('\n')
      } catch (e: any) { return '获取图表失败: ' + e.message }
    },
  }))

  ctx.logger?.info('[drawio] HOST 半端已激活（2 个工具）')
}

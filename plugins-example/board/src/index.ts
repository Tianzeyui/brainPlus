/**
 * board — 卡片看板插件（新范式）
 *
 * HOST 半端：AI 工具在主进程执行（ctx.get('supabase')）
 * CLIENT 半端：挂载宿主页面（board 页面在宿主不存在时仅注册导航，UI 待迁移）
 */
export const name = 'board'
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
    name: 'board_list_pools',
    description: '列出当前用户的所有看板。返回看板 id、名称、描述。需要查看某个看板的卡片时用 board_list_cards。',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_a: any, v: string) => [{ type: 'text', text: v }],
    },
    execute: async () => {
      try {
        const sb = getSB()
        const { data, error } = await sb.from('board_pools').select('id,name,description,updated_at').order('updated_at', { ascending: false })
        if (error) throw error
        const pools = (data || []) as any[]
        if (!pools.length) return '暂无看板。'
        return pools.map((p: any) => `- ${p.name} (${p.id.slice(0, 8)}) | ${p.description || '无描述'} | ${new Date(p.updated_at).toLocaleString('zh-CN')}`).join('\n')
      } catch (e: any) { return '查询失败: ' + e.message }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'board_list_cards',
    description: '列出指定看板的所有卡片。需要 pool_id（看板 id）。返回卡片标题、优先级、负责人、所属阶段/泳道等摘要信息。支持前 8 位短 id 匹配 pool_id。',
    parameters: {
      pool_id: { type: 'string', required: true, description: '看板 id，支持前 8 位短 id' },
    },
    output: {
      schema: { type: 'string' },
      render: (_a: any, v: string) => [{ type: 'text', text: v }],
    },
    execute: async (args: { pool_id: string }) => {
      try {
        const sb = getSB()
        let poolQuery = sb.from('board_pools').select('id,name')
        poolQuery = args.pool_id.length < 36
          ? poolQuery.filter('id::text', 'like', `${args.pool_id}%`)
          : poolQuery.eq('id', args.pool_id)
        const { data: pools, error: poolErr } = await poolQuery
        if (poolErr) throw poolErr
        if (!pools || pools.length === 0) return `未找到 id=${args.pool_id} 的看板。`

        const pool = pools[0] as any
        const [{ data: stages }, { data: lanes }, { data: cards }] = await Promise.all([
          sb.from('board_stages').select('id,name').eq('pool_id', pool.id).order('sort_order'),
          sb.from('board_lanes').select('id,name').eq('pool_id', pool.id).order('sort_order'),
          sb.from('board_cards').select('id,title,priority,assignee,note,lane_id,stage_id').eq('pool_id', pool.id).order('order_in_cell'),
        ])

        const stageMap = new Map((stages || []).map((s: any) => [s.id, s.name]))
        const laneMap = new Map((lanes || []).map((l: any) => [l.id, l.name]))

        if (!cards || cards.length === 0) return `看板「${pool.name}」暂无卡片。`

        return `## ${pool.name}\n\n` + (cards as any[]).map((c: any) => {
          const stage = stageMap.get(c.stage_id) || '未分类'
          const lane = laneMap.get(c.lane_id) || '默认'
          const noteIcon = c.note ? ' 📝' : ''
          return `- [${c.priority}] ${c.title} | ${lane} → ${stage}${noteIcon} (${c.id.slice(0, 8)})`
        }).join('\n')
      } catch (e: any) { return '查询失败: ' + e.message }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'board_get_card',
    description: '获取指定卡片的完整详情（含内容、备注）。先用 board_list_cards 拿到卡片 id，再用此工具。支持前 8 位短 id。',
    parameters: {
      id: { type: 'string', required: true, description: '卡片 id，支持前 8 位短 id' },
    },
    output: {
      schema: { type: 'string' },
      render: (_a: any, v: string) => [{ type: 'text', text: v }],
    },
    execute: async (args: { id: string }) => {
      try {
        const sb = getSB()
        let q = sb.from('board_cards').select('*')
        q = args.id.length < 36 ? q.filter('id::text', 'like', `${args.id}%`) : q.eq('id', args.id)
        const { data, error } = await q.maybeSingle()
        if (error) throw error
        if (!data) return `未找到 id=${args.id} 的卡片。`
        const c = data as any
        return `## ${c.title}\n\n**内容:**\n${c.content || '(无内容)'}\n\n**备注:**\n${c.note || '(无备注)'}\n\n- 优先级: ${c.priority}\n- 创建人: ${c.created_by || '未知'}\n- 创建时间: ${new Date(c.created_at).toLocaleString('zh-CN')}`
      } catch (e: any) { return '查询失败: ' + e.message }
    },
  }))

  ctx.logger?.info('[board] HOST 半端已激活（3 个工具）')
}

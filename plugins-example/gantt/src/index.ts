/**
 * gantt — 甘特图插件（新范式）
 *
 * HOST 半端：AI 工具在主进程执行（ctx.get('supabase')）
 */
export const name = 'gantt'
export const inject = ['tools', 'supabase']
export const provide = []

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function apply(ctx: any) {
  const defineTool = ctx.get('defineTool')

  function getSB() {
    const sb = ctx.get('supabase')
    if (!sb) throw new Error('Supabase 未配置')
    return sb
  }

  ctx.tools.register(defineTool({
    name: 'gantt_list',
    description: '查询甘特图任务列表。可按日期范围、状态筛选。不传参数时返回全部。返回 id、名称、日期、状态等摘要。需要查看某个任务描述时用 gantt_get。',
    parameters: {
      date_from: { type: 'string', description: '开始日期 YYYY-MM-DD（可选）' },
      date_to: { type: 'string', description: '截止日期 YYYY-MM-DD（可选）' },
      status: { type: 'string', description: 'pending / in-progress / completed' },
    },
    output: {
      schema: { type: 'string' },
      render: (_a: any, v: string) => [{ type: 'text', text: v }],
    },
    execute: async (args: { date_from?: string; date_to?: string; status?: string }) => {
      try {
        const sb = getSB()
        let q = sb.from('gantt_tasks').select('id,name,start_date,ddl,color,status').order('start_date', { ascending: true })
        if (args.date_from) q = q.gte('start_date', args.date_from)
        if (args.date_to) q = q.lte('ddl', args.date_to)
        if (args.status) q = q.eq('status', args.status)
        const { data, error } = await q
        if (error) throw error
        const rows = (data || []) as any[]
        if (!rows.length) return '没有匹配的任务。'
        return rows.map((t: any) =>
          `- ${t.name} (${t.id.slice(0, 8)}) | ${t.start_date} → ${t.ddl} | ${t.status}${t.ddl < formatDate(new Date()) && t.status !== 'completed' ? ' ⚠️逾期' : ''}`
        ).join('\n')
      } catch (e: any) { return '查询失败: ' + e.message }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'gantt_get',
    description: '按 id 获取任务完整详情（含描述）。先用 gantt_list 拿到 id，再用此工具。',
    parameters: {
      id: { type: 'string', required: true, description: '任务 id，支持前 8 位短 id' },
    },
    output: {
      schema: { type: 'string' },
      render: (_a: any, v: string) => [{ type: 'text', text: v }],
    },
    execute: async (args: { id: string }) => {
      try {
        const sb = getSB()
        let q = sb.from('gantt_tasks').select('*')
        q = args.id.length < 36 ? q.filter('id::text', 'like', `${args.id}%`) : q.eq('id', args.id)
        const { data, error } = await q.maybeSingle()
        if (error) throw error
        if (!data) return `未找到 id=${args.id} 的任务。`
        const t = data as any
        const overdue = t.ddl < formatDate(new Date()) && t.status !== 'completed'
        return `## ${t.name}\n\n${t.description || '(无描述)'}\n\n- 开始: ${t.start_date}\n- 截止: ${t.ddl}${overdue ? ' (已逾期)' : ''}\n- 状态: ${t.status}`
      } catch (e: any) { return '查询失败: ' + e.message }
    },
  }))

  ctx.logger?.info('[gantt] HOST 半端已激活（2 个工具）')
}

/**
 * diary — 日记插件（新范式：对齐 DSH/Cordis）
 *
 * HOST 半端：AI 工具在主进程执行（ctx.get('supabase') 查数据）
 * CLIENT 半端：挂载宿主内置 DiaryPage（见 src/client.ts）
 *
 * 构建: node scripts/build-plugin.mjs .（产物 lib/index.js + lib/client.js）
 * defineTool 由宿主注入（ctx.get('defineTool')），插件无需依赖 dsh-tools
 */
export const name = 'diary'
export const inject = ['tools', 'supabase']
export const provide = []

export function apply(ctx: any) {
  const defineTool = ctx.get('defineTool')
  // ====== 只读工具：时间线 ======
  ctx.tools.register(defineTool({
    name: 'diary_timeline',
    description:
      '查看日记时间线，列出有日记记录的日期及标题。可用于快速了解用户的日记习惯和关注话题。' +
      '不返回正文内容，需要详细内容时使用 diary_get。',
    parameters: {
      year: { type: 'number', description: '筛选年份（可选），如 2026' },
      month: { type: 'number', description: '筛选月份 1-12（可选），需与 year 一起使用' },
    },
    output: {
      schema: { type: 'string' },
      render: (_a: any, v: string) => [{ type: 'text', text: v }],
    },
    execute: async (args: { year?: number; month?: number }) => {
      try {
        const sb = ctx.get('supabase')
        if (!sb) return 'Supabase 未配置。'
        let query = sb.from('diary_entries')
          .select('entry_date, title, mood')
          .order('entry_date', { ascending: false })

        if (args.year) {
          const y = String(args.year)
          if (args.month) {
            const m = String(args.month).padStart(2, '0')
            query = query.gte('entry_date', `${y}-${m}-01`).lt('entry_date', m === '12' ? `${Number(y) + 1}-01-01` : `${y}-${String(Number(m) + 1).padStart(2, '0')}-01`)
          } else {
            query = query.gte('entry_date', `${y}-01-01`).lt('entry_date', `${Number(y) + 1}-01-01`)
          }
        }

        const { data, error } = await query
        if (error) throw error
        const entries = (data || []) as any[]
        if (entries.length === 0) {
          const scope = args.year
            ? args.month ? `${args.year}年${args.month}月` : `${args.year}年`
            : ''
          return scope ? `${scope}暂无日记记录。` : '暂无日记记录。'
        }

        const lines = entries.map((e: any) =>
          `- **${e.entry_date}**${e.title ? ` — ${e.title}` : ''}${e.mood ? ` [${e.mood}]` : ''}`
        )
        return `${entries.length} 篇日记：\n${lines.join('\n')}`
      } catch (e: any) {
        return `获取日记时间线失败：${e.message}`
      }
    },
  }))

  // ====== 只读工具：查看详情 ======
  ctx.tools.register(defineTool({
    name: 'diary_get',
    description:
      '获取指定日期的日记全文。先用 diary_timeline 查看有哪些日期有日记，再按日期读取详细内容。' +
      '如果用户提到某个日期或事件，可以用此工具查看当天的日记。',
    parameters: {
      date: { type: 'string', required: true, description: '日期，格式 YYYY-MM-DD' },
    },
    output: {
      schema: { type: 'string' },
      render: (_a: any, v: string) => [{ type: 'text', text: v }],
    },
    execute: async (args: { date: string }) => {
      try {
        const sb = ctx.get('supabase')
        if (!sb) return 'Supabase 未配置。'
        const { data, error } = await sb.from('diary_entries')
          .select('*').eq('entry_date', args.date).maybeSingle()
        if (error) throw error
        if (!data) return `${args.date} 没有日记记录。`
        const e = data as any
        return [
          `## ${e.entry_date}${e.title ? ` — ${e.title}` : ''}${e.mood ? `  [${e.mood}]` : ''}`,
          '',
          e.content || '(空)',
        ].join('\n')
      } catch (e: any) {
        return `获取日记失败：${e.message}`
      }
    },
  }))

  ctx.logger?.info('[diary] HOST 半端已激活（2 个工具）')
}

/**
 * gantt — CLIENT 半端
 *
 * 宿主暂无 gantt 页面，仅注册导航（工具已迁移主进程）。
 */
export function registerClient(ctx: any) {
  ctx.registerNav({ id: 'gantt', label: '甘特图', icon: 'CalendarRange', order: 80 })
}

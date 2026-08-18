/**
 * drawio — CLIENT 半端
 *
 * 宿主暂无 drawio 页面，仅注册导航（工具已迁移主进程）。
 */
export function registerClient(ctx: any) {
  ctx.registerNav({ id: 'drawio', label: 'drawio', icon: 'Workflow', order: 80 })
}

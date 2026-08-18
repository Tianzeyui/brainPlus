/**
 * board — CLIENT 半端
 *
 * 宿主暂无 board 页面，仅注册导航（工具已迁移主进程）。
 * 页面 UI 后续迁移到插件自包含组件（src/client.tsx）。
 */
export function registerClient(ctx: any) {
  ctx.registerNav({ id: 'board', label: '卡片看板', icon: 'FolderKanban', order: 70 })
}

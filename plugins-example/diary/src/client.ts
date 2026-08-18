/**
 * diary — CLIENT 半端（页面挂载）
 *
 * 渲染进程执行：挂载宿主内置 DiaryPage。
 */
export function registerClient(ctx: any) {
  ctx.registerNav({ id: 'diary', label: '日记', icon: 'BookOpen', order: 60 })
  ctx.registerRoute('diary', 'DiaryPage')
}
